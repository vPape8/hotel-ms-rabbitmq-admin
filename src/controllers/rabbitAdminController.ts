import { Request, Response } from 'express';
import { validarBinding } from '../dto/bindingDto';
import { validarCrearCola } from '../dto/colaDto';
import { validarCrearExchange } from '../dto/exchangeDto';
import { ErrorValidacion, validarNombre } from '../dto/validacion';
import {
	ConflictoRabbitError,
	RabbitAdmin,
	RabbitNoDisponibleError,
	RecursoNoEncontradoError,
	RecursoProtegidoError
} from '../services/rabbitAdminService';

function responderValidacion(respuesta: Response, detalles: ErrorValidacion[]): void {
	respuesta.status(400).json({ error: 'VALIDACION', detalles });
}

function responderError(respuesta: Response, error: unknown): void {
	const mensaje = error instanceof Error ? error.message : undefined;
	if (error instanceof RecursoNoEncontradoError) {
		respuesta.status(404).json({ error: 'RECURSO_NO_ENCONTRADO', mensaje });
	} else if (error instanceof RecursoProtegidoError) {
		respuesta.status(409).json({ error: 'RECURSO_PROTEGIDO', mensaje });
	} else if (error instanceof ConflictoRabbitError) {
		respuesta.status(409).json({ error: 'CONFLICTO_RABBITMQ', mensaje });
	} else if (error instanceof RabbitNoDisponibleError) {
		respuesta.status(503).json({ error: 'RABBITMQ_NO_DISPONIBLE', mensaje });
	} else {
		respuesta.status(500).json({ error: 'ERROR_INTERNO' });
	}
}

/** Lee ?ifUnused=true&ifEmpty=true; cualquier otro valor distinto de true/false es un error. */
function banderas(solicitud: Request, nombres: string[], errores: ErrorValidacion[]): Record<string, boolean> {
	const resultado: Record<string, boolean> = {};
	for (const nombre of nombres) {
		const valor = solicitud.query[nombre];
		if (valor === undefined) {
			resultado[nombre] = false;
		} else if (valor === 'true' || valor === 'false') {
			resultado[nombre] = valor === 'true';
		} else {
			errores.push({ campo: nombre, mensaje: 'Debe ser true o false' });
		}
	}
	return resultado;
}

/** Controladores delgados: validan la entrada con los DTO y delegan en RabbitAdmin. */
export class RabbitAdminController {
	constructor(private readonly servicio: RabbitAdmin) {}

	listarColas = async (_solicitud: Request, respuesta: Response): Promise<void> => {
		try {
			respuesta.json({ data: await this.servicio.listarColas() });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	crearCola = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const validacion = validarCrearCola(solicitud.body);
		if (!validacion.ok) {
			responderValidacion(respuesta, validacion.errores);
			return;
		}
		try {
			respuesta.status(201).json({ data: await this.servicio.crearCola(validacion.valor) });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	eliminarCola = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const errores: ErrorValidacion[] = [];
		const nombre = validarNombre(solicitud.params.name, 'name', errores);
		const { ifUnused, ifEmpty } = banderas(solicitud, ['ifUnused', 'ifEmpty'], errores);
		if (!nombre || errores.length > 0) {
			responderValidacion(respuesta, errores);
			return;
		}
		try {
			respuesta.json({ data: await this.servicio.eliminarCola(nombre, { ifUnused, ifEmpty }) });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	listarExchanges = async (_solicitud: Request, respuesta: Response): Promise<void> => {
		try {
			respuesta.json({ data: await this.servicio.listarExchanges() });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	crearExchange = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const validacion = validarCrearExchange(solicitud.body);
		if (!validacion.ok) {
			responderValidacion(respuesta, validacion.errores);
			return;
		}
		try {
			await this.servicio.crearExchange(validacion.valor);
			respuesta.status(201).json({ data: validacion.valor });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	eliminarExchange = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const errores: ErrorValidacion[] = [];
		const nombre = validarNombre(solicitud.params.name, 'name', errores);
		const { ifUnused } = banderas(solicitud, ['ifUnused'], errores);
		if (!nombre || errores.length > 0) {
			responderValidacion(respuesta, errores);
			return;
		}
		try {
			await this.servicio.eliminarExchange(nombre, { ifUnused });
			respuesta.status(204).send();
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	listarBindings = async (_solicitud: Request, respuesta: Response): Promise<void> => {
		try {
			respuesta.json({ data: await this.servicio.listarBindings() });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	crearBinding = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const validacion = validarBinding(solicitud.body);
		if (!validacion.ok) {
			responderValidacion(respuesta, validacion.errores);
			return;
		}
		try {
			await this.servicio.crearBinding(validacion.valor);
			respuesta.status(201).json({ data: validacion.valor });
		} catch (error) {
			responderError(respuesta, error);
		}
	};

	/** DELETE /api/v1/bindings?source=...&destination=...&destinationType=queue&routingKey=... */
	eliminarBinding = async (solicitud: Request, respuesta: Response): Promise<void> => {
		const validacion = validarBinding({ ...solicitud.query });
		if (!validacion.ok) {
			responderValidacion(respuesta, validacion.errores);
			return;
		}
		try {
			await this.servicio.eliminarBinding(validacion.valor);
			respuesta.status(204).send();
		} catch (error) {
			responderError(respuesta, error);
		}
	};
}
