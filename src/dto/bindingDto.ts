import { esObjeto, ResultadoValidacion, Validador } from './validacion';

export const TIPOS_DESTINO = ['queue', 'exchange'] as const;
export type TipoDestino = (typeof TIPOS_DESTINO)[number];

/** POST /api/v1/bindings y DELETE /api/v1/bindings?source=&destination=&destinationType=&routingKey= */
export interface BindingDto {
	/** Exchange de origen. */
	source: string;
	/** Cola o exchange de destino. */
	destination: string;
	destinationType: TipoDestino;
	routingKey: string;
}

const CAMPOS = ['source', 'destination', 'destinationType', 'routingKey'];

export function validarBinding(cuerpo: unknown): ResultadoValidacion<BindingDto> {
	if (!esObjeto(cuerpo)) {
		return { ok: false, errores: [{ campo: 'body', mensaje: 'Se esperaba un objeto JSON' }] };
	}

	const v = new Validador(cuerpo, CAMPOS);
	const dto: BindingDto = {
		source: v.nombre('source') ?? '',
		destination: v.nombre('destination') ?? '',
		destinationType: v.opcion('destinationType', TIPOS_DESTINO, 'queue') ?? 'queue',
		routingKey: v.routingKey('routingKey')
	};

	if (dto.destinationType === 'exchange' && dto.source === dto.destination) {
		v.errores.push({ campo: 'destination', mensaje: 'Un exchange no puede enlazarse consigo mismo' });
	}

	return v.resultado(dto);
}
