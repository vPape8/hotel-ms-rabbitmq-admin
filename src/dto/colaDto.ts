import { esObjeto, ResultadoValidacion, Validador } from './validacion';

/** POST /api/v1/queues */
export interface CrearColaDto {
	name: string;
	durable: boolean;
	autoDelete: boolean;
	/** Exchange al que van los mensajes rechazados o vencidos (DLX). */
	deadLetterExchange?: string;
	deadLetterRoutingKey?: string;
	/** TTL de los mensajes en milisegundos. */
	messageTtl?: number;
	maxLength?: number;
}

const CAMPOS = ['name', 'durable', 'autoDelete', 'deadLetterExchange', 'deadLetterRoutingKey', 'messageTtl', 'maxLength'];
const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

export function validarCrearCola(cuerpo: unknown): ResultadoValidacion<CrearColaDto> {
	if (!esObjeto(cuerpo)) {
		return { ok: false, errores: [{ campo: 'body', mensaje: 'Se esperaba un objeto JSON' }] };
	}

	const v = new Validador(cuerpo, CAMPOS);
	const dto: CrearColaDto = {
		name: v.nombre('name') ?? '',
		durable: v.booleano('durable', true),
		autoDelete: v.booleano('autoDelete', false),
		deadLetterExchange: v.nombre('deadLetterExchange', false),
		deadLetterRoutingKey: cuerpo.deadLetterRoutingKey === undefined ? undefined : v.routingKey('deadLetterRoutingKey'),
		messageTtl: v.entero('messageTtl', 1, SIETE_DIAS_MS),
		maxLength: v.entero('maxLength', 1, 1_000_000)
	};

	if (dto.deadLetterRoutingKey !== undefined && dto.deadLetterExchange === undefined) {
		v.errores.push({ campo: 'deadLetterRoutingKey', mensaje: 'Requiere deadLetterExchange' });
	}
	if (dto.deadLetterExchange !== undefined && dto.deadLetterExchange === dto.name) {
		v.errores.push({ campo: 'deadLetterExchange', mensaje: 'No puede llamarse igual que la cola' });
	}

	return v.resultado(dto);
}
