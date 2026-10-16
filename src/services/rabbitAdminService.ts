import amqp, { Channel } from 'amqplib';
import { rabbitAdminConfig } from '../config/rabbitmq.config';
import { BindingDto } from '../dto/bindingDto';
import { CrearColaDto } from '../dto/colaDto';
import { CrearExchangeDto } from '../dto/exchangeDto';

export class RecursoNoEncontradoError extends Error {}
export class ConflictoRabbitError extends Error {}
export class RecursoProtegidoError extends Error {}
export class RabbitNoDisponibleError extends Error {}

export interface ColaInfo {
	name: string;
	durable: boolean;
	autoDelete: boolean;
	messages: number;
	consumers: number;
	arguments: Record<string, unknown>;
}

export interface ExchangeInfo {
	name: string;
	type: string;
	durable: boolean;
	autoDelete: boolean;
	internal: boolean;
	arguments: Record<string, unknown>;
}

export interface BindingInfo extends BindingDto {
	arguments: Record<string, unknown>;
}

/** Operaciones de alto nivel que usan los controladores: no saben nada de amqplib ni de la API HTTP. */
export interface RabbitAdmin {
	listarColas(): Promise<ColaInfo[]>;
	crearCola(dto: CrearColaDto): Promise<{ name: string; messages: number; consumers: number }>;
	eliminarCola(nombre: string, opciones: { ifUnused: boolean; ifEmpty: boolean }): Promise<{ messagesDeleted: number }>;
	listarExchanges(): Promise<ExchangeInfo[]>;
	crearExchange(dto: CrearExchangeDto): Promise<void>;
	eliminarExchange(nombre: string, opciones: { ifUnused: boolean }): Promise<void>;
	listarBindings(): Promise<BindingInfo[]>;
	crearBinding(dto: BindingDto): Promise<void>;
	eliminarBinding(dto: BindingDto): Promise<void>;
}

/** Errores AMQP que cierran el canal: 404 NOT_FOUND, 406 PRECONDITION_FAILED, 403 ACCESS_REFUSED. */
function traducirError(error: unknown): Error {
	const codigo = (error as { code?: unknown }).code;
	const mensaje = error instanceof Error ? error.message : String(error);
	if (codigo === 404) return new RecursoNoEncontradoError(mensaje);
	if (codigo === 406 || codigo === 403 || codigo === 405) return new ConflictoRabbitError(mensaje);
	if (error instanceof RecursoNoEncontradoError || error instanceof ConflictoRabbitError || error instanceof RecursoProtegidoError) return error;
	return new RabbitNoDisponibleError(mensaje);
}

export class RabbitAdminService implements RabbitAdmin {
	private conexion?: Promise<amqp.ChannelModel>;

	// ---------- Colas ----------

	async listarColas(): Promise<ColaInfo[]> {
		const colas = await this.management<Array<Record<string, unknown>>>('queues');
		return colas.map((cola) => ({
			name: String(cola.name),
			durable: Boolean(cola.durable),
			autoDelete: Boolean(cola.auto_delete),
			messages: Number(cola.messages ?? 0),
			consumers: Number(cola.consumers ?? 0),
			arguments: (cola.arguments ?? {}) as Record<string, unknown>
		}));
	}

	async crearCola(dto: CrearColaDto): Promise<{ name: string; messages: number; consumers: number }> {
		const argumentos: Record<string, unknown> = {};
		if (dto.deadLetterExchange) argumentos['x-dead-letter-exchange'] = dto.deadLetterExchange;
		if (dto.deadLetterRoutingKey !== undefined) argumentos['x-dead-letter-routing-key'] = dto.deadLetterRoutingKey;
		if (dto.messageTtl !== undefined) argumentos['x-message-ttl'] = dto.messageTtl;
		if (dto.maxLength !== undefined) argumentos['x-max-length'] = dto.maxLength;

		// assertQueue es idempotente: si ya existe con los mismos argumentos no cambia nada,
		// si existe con otros, RabbitMQ responde 406 y se informa como conflicto.
		const resultado = await this.conCanal((canal) =>
			canal.assertQueue(dto.name, { durable: dto.durable, autoDelete: dto.autoDelete, arguments: argumentos }));
		return { name: resultado.queue, messages: resultado.messageCount, consumers: resultado.consumerCount };
	}

	async eliminarCola(nombre: string, opciones: { ifUnused: boolean; ifEmpty: boolean }): Promise<{ messagesDeleted: number }> {
		this.verificarNoProtegido(rabbitAdminConfig.protegidos.colas, nombre, 'cola');
		await this.conCanal((canal) => canal.checkQueue(nombre));
		const resultado = await this.conCanal((canal) => canal.deleteQueue(nombre, opciones));
		return { messagesDeleted: resultado.messageCount };
	}

	// ---------- Exchanges ----------

	async listarExchanges(): Promise<ExchangeInfo[]> {
		const exchanges = await this.management<Array<Record<string, unknown>>>('exchanges');
		return exchanges
			.filter((exchange) => exchange.name !== '' && !String(exchange.name).startsWith('amq.'))
			.map((exchange) => ({
				name: String(exchange.name),
				type: String(exchange.type),
				durable: Boolean(exchange.durable),
				autoDelete: Boolean(exchange.auto_delete),
				internal: Boolean(exchange.internal),
				arguments: (exchange.arguments ?? {}) as Record<string, unknown>
			}));
	}

	async crearExchange(dto: CrearExchangeDto): Promise<void> {
		await this.conCanal((canal) => canal.assertExchange(dto.name, dto.type, {
			durable: dto.durable,
			autoDelete: dto.autoDelete,
			internal: dto.internal,
			alternateExchange: dto.alternateExchange
		}));
	}

	async eliminarExchange(nombre: string, opciones: { ifUnused: boolean }): Promise<void> {
		this.verificarNoProtegido(rabbitAdminConfig.protegidos.exchanges, nombre, 'exchange');
		await this.conCanal((canal) => canal.checkExchange(nombre));
		await this.conCanal((canal) => canal.deleteExchange(nombre, opciones));
	}

	// ---------- Bindings ----------

	async listarBindings(): Promise<BindingInfo[]> {
		const bindings = await this.management<Array<Record<string, unknown>>>('bindings');
		return bindings
			.filter((binding) => binding.source !== '')
			.map((binding) => ({
				source: String(binding.source),
				destination: String(binding.destination),
				destinationType: binding.destination_type === 'exchange' ? 'exchange' : 'queue',
				routingKey: String(binding.routing_key ?? ''),
				arguments: (binding.arguments ?? {}) as Record<string, unknown>
			}));
	}

	async crearBinding(dto: BindingDto): Promise<void> {
		await this.conCanal((canal) => dto.destinationType === 'queue'
			? canal.bindQueue(dto.destination, dto.source, dto.routingKey)
			: canal.bindExchange(dto.destination, dto.source, dto.routingKey));
	}

	async eliminarBinding(dto: BindingDto): Promise<void> {
		const existe = (await this.listarBindings()).some((binding) => binding.source === dto.source
			&& binding.destination === dto.destination
			&& binding.destinationType === dto.destinationType
			&& binding.routingKey === dto.routingKey);
		if (!existe) {
			throw new RecursoNoEncontradoError('El binding no existe');
		}
		if (rabbitAdminConfig.protegidos.exchanges.includes(dto.source) && rabbitAdminConfig.protegidos.colas.includes(dto.destination)) {
			throw new RecursoProtegidoError(`El binding ${dto.source} -> ${dto.destination} es parte de la topología del sistema`);
		}
		await this.conCanal((canal) => dto.destinationType === 'queue'
			? canal.unbindQueue(dto.destination, dto.source, dto.routingKey)
			: canal.unbindExchange(dto.destination, dto.source, dto.routingKey));
	}

	async cerrar(): Promise<void> {
		const conexion = this.conexion;
		this.conexion = undefined;
		await (await conexion?.catch(() => undefined))?.close().catch(() => undefined);
	}

	// ---------- Infraestructura ----------

	private verificarNoProtegido(protegidos: readonly string[], nombre: string, tipo: string): void {
		if (protegidos.includes(nombre)) {
			throw new RecursoProtegidoError(`La ${tipo} ${nombre} es parte de la topología del sistema y no se puede eliminar`);
		}
	}

	private obtenerConexion(): Promise<amqp.ChannelModel> {
		this.conexion ??= amqp.connect(rabbitAdminConfig.url).then((conexion) => {
			conexion.on('error', () => undefined);
			conexion.on('close', () => {
				this.conexion = undefined;
			});
			return conexion;
		}).catch((error: unknown) => {
			this.conexion = undefined;
			throw new RabbitNoDisponibleError(error instanceof Error ? error.message : String(error));
		});
		return this.conexion;
	}

	/**
	 * Un canal nuevo por operación: si RabbitMQ rechaza algo (404/406) cierra el canal,
	 * pero la conexión y las demás peticiones siguen funcionando.
	 */
	private async conCanal<T>(operacion: (canal: Channel) => Promise<T>): Promise<T> {
		const conexion = await this.obtenerConexion();
		let canal: Channel;
		try {
			canal = await conexion.createChannel();
		} catch (error) {
			throw new RabbitNoDisponibleError(error instanceof Error ? error.message : String(error));
		}
		canal.on('error', () => undefined);
		let cerrado = false;
		canal.once('close', () => {
			cerrado = true;
		});

		try {
			return await operacion(canal);
		} catch (error) {
			throw traducirError(error);
		} finally {
			if (!cerrado) {
				await canal.close().catch(() => undefined);
			}
		}
	}

	private async management<T>(recurso: string): Promise<T> {
		const url = `${rabbitAdminConfig.managementUrl}/api/${recurso}/${encodeURIComponent(rabbitAdminConfig.vhost)}`;
		let respuesta: Response;
		try {
			respuesta = await fetch(url, {
				headers: { Authorization: `Basic ${Buffer.from(`${rabbitAdminConfig.usuario}:${rabbitAdminConfig.clave}`).toString('base64')}` },
				signal: AbortSignal.timeout(5000)
			});
		} catch (error) {
			throw new RabbitNoDisponibleError(error instanceof Error ? error.message : String(error));
		}
		if (!respuesta.ok) {
			throw new RabbitNoDisponibleError(`La API de management respondió ${respuesta.status}`);
		}
		return (await respuesta.json()) as T;
	}
}
