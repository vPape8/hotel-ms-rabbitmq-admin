export interface ErrorValidacion {
	campo: string;
	mensaje: string;
}

export type ResultadoValidacion<T> = { ok: true; valor: T } | { ok: false; errores: ErrorValidacion[] };

// Nombres AMQP: hasta 255 caracteres; aquí además se limitan a letras, números y . _ - : para evitar
// nombres con espacios o caracteres raros. El prefijo "amq." está reservado por RabbitMQ.
const NOMBRE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;

export function esObjeto(valor: unknown): valor is Record<string, unknown> {
	return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

export class Validador {
	readonly errores: ErrorValidacion[] = [];

	constructor(private readonly cuerpo: Record<string, unknown>, permitidos: string[]) {
		for (const campo of Object.keys(cuerpo)) {
			if (!permitidos.includes(campo)) {
				this.errores.push({ campo, mensaje: `Campo no permitido. Usa: ${permitidos.join(', ')}` });
			}
		}
	}

	nombre(campo: string, obligatorio = true): string | undefined {
		const valor = this.cuerpo[campo];
		if (valor === undefined && !obligatorio) {
			return undefined;
		}
		return validarNombre(valor, campo, this.errores);
	}

	booleano(campo: string, porDefecto: boolean): boolean {
		const valor = this.cuerpo[campo];
		if (valor === undefined) {
			return porDefecto;
		}
		if (typeof valor !== 'boolean') {
			this.errores.push({ campo, mensaje: 'Debe ser true o false' });
			return porDefecto;
		}
		return valor;
	}

	entero(campo: string, minimo: number, maximo: number): number | undefined {
		const valor = this.cuerpo[campo];
		if (valor === undefined) {
			return undefined;
		}
		if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
			this.errores.push({ campo, mensaje: `Debe ser un entero entre ${minimo} y ${maximo}` });
			return undefined;
		}
		return valor;
	}

	opcion<T extends string>(campo: string, opciones: readonly T[], porDefecto?: T): T | undefined {
		const valor = this.cuerpo[campo] ?? porDefecto;
		if (typeof valor !== 'string' || !opciones.includes(valor as T)) {
			this.errores.push({ campo, mensaje: `Debe ser uno de: ${opciones.join(', ')}` });
			return undefined;
		}
		return valor as T;
	}

	routingKey(campo: string): string {
		const valor = this.cuerpo[campo] ?? '';
		if (typeof valor !== 'string' || valor.length > 255 || /\s/.test(valor)) {
			this.errores.push({ campo, mensaje: 'Debe ser texto sin espacios de hasta 255 caracteres' });
			return '';
		}
		return valor;
	}

	resultado<T>(valor: T): ResultadoValidacion<T> {
		return this.errores.length > 0 ? { ok: false, errores: this.errores } : { ok: true, valor };
	}
}

export function validarNombre(valor: unknown, campo: string, errores: ErrorValidacion[]): string | undefined {
	if (typeof valor !== 'string' || !valor.trim()) {
		errores.push({ campo, mensaje: 'Es obligatorio y no puede estar vacío' });
		return undefined;
	}
	if (valor.startsWith('amq.')) {
		errores.push({ campo, mensaje: 'El prefijo "amq." está reservado por RabbitMQ' });
		return undefined;
	}
	if (!NOMBRE.test(valor)) {
		errores.push({ campo, mensaje: 'Solo letras, números y . _ - : (máx. 255, sin espacios)' });
		return undefined;
	}
	return valor;
}
