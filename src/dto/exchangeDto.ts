import { esObjeto, ResultadoValidacion, Validador } from './validacion';

export const TIPOS_EXCHANGE = ['direct', 'topic', 'fanout', 'headers'] as const;
export type TipoExchange = (typeof TIPOS_EXCHANGE)[number];

/** POST /api/v1/exchanges */
export interface CrearExchangeDto {
	name: string;
	type: TipoExchange;
	durable: boolean;
	autoDelete: boolean;
	/** Solo recibe mensajes de otros exchanges (no de publicadores). */
	internal: boolean;
	/** Exchange que recibe los mensajes que este no puede enrutar. */
	alternateExchange?: string;
}

const CAMPOS = ['name', 'type', 'durable', 'autoDelete', 'internal', 'alternateExchange'];

export function validarCrearExchange(cuerpo: unknown): ResultadoValidacion<CrearExchangeDto> {
	if (!esObjeto(cuerpo)) {
		return { ok: false, errores: [{ campo: 'body', mensaje: 'Se esperaba un objeto JSON' }] };
	}

	const v = new Validador(cuerpo, CAMPOS);
	const dto: CrearExchangeDto = {
		name: v.nombre('name') ?? '',
		type: v.opcion('type', TIPOS_EXCHANGE) ?? 'direct',
		durable: v.booleano('durable', true),
		autoDelete: v.booleano('autoDelete', false),
		internal: v.booleano('internal', false),
		alternateExchange: v.nombre('alternateExchange', false)
	};

	if (dto.alternateExchange !== undefined && dto.alternateExchange === dto.name) {
		v.errores.push({ campo: 'alternateExchange', mensaje: 'No puede ser el mismo exchange' });
	}

	return v.resultado(dto);
}
