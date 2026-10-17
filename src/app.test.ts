import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import test from 'node:test';
import { crearApp } from './app';
import { BindingDto } from './dto/bindingDto';
import { CrearColaDto } from './dto/colaDto';
import { RabbitAdmin, RecursoNoEncontradoError, RecursoProtegidoError } from './services/rabbitAdminService';

class RabbitAdminFalso implements RabbitAdmin {
	colas: CrearColaDto[] = [];
	bindingsEliminados: BindingDto[] = [];

	async listarColas() { return []; }
	async crearCola(dto: CrearColaDto) { this.colas.push(dto); return { name: dto.name, messages: 0, consumers: 0 }; }
	async eliminarCola(nombre: string) {
		if (nombre === 'hotel.reportes.pdf.queue') throw new RecursoProtegidoError('protegida');
		if (nombre === 'no-existe') throw new RecursoNoEncontradoError('no existe');
		return { messagesDeleted: 3 };
	}
	async listarExchanges() { return []; }
	async crearExchange() {}
	async eliminarExchange() {}
	async listarBindings() { return []; }
	async crearBinding() {}
	async eliminarBinding(dto: BindingDto) { this.bindingsEliminados.push(dto); }
}

test('API del administrador de RabbitMQ', async (contexto) => {
	const servicio = new RabbitAdminFalso();
	const servidor = crearApp(servicio, (_solicitud, _respuesta, siguiente) => siguiente()).listen(0);
	await new Promise<void>((resolve) => servidor.once('listening', resolve));
	contexto.after(() => servidor.close());
	const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/api/v1`;
	const json = (metodo: string, cuerpo: unknown) => ({ method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });

	await contexto.test('crea una cola válida con valores por defecto', async () => {
		const respuesta = await fetch(`${base}/queues`, json('POST', { name: 'hotel.pruebas.queue', messageTtl: 60000 }));
		assert.equal(respuesta.status, 201);
		assert.deepEqual(servicio.colas[0], {
			name: 'hotel.pruebas.queue', durable: true, autoDelete: false, deadLetterExchange: undefined,
			deadLetterRoutingKey: undefined, messageTtl: 60000, maxLength: undefined
		});
	});

	await contexto.test('rechaza nombres vacíos, reservados o con espacios y campos desconocidos', async () => {
		for (const cuerpo of [{ name: '' }, { name: '   ' }, { name: 'amq.mia' }, { name: 'con espacios' }, { name: 'ok', otro: 1 }, { name: 'ok', messageTtl: -5 }]) {
			const respuesta = await fetch(`${base}/queues`, json('POST', cuerpo));
			assert.equal(respuesta.status, 400, JSON.stringify(cuerpo));
			const body = await respuesta.json() as { error: string; detalles: unknown[] };
			assert.equal(body.error, 'VALIDACION');
			assert.ok(body.detalles.length > 0);
		}
	});

	await contexto.test('exige deadLetterExchange si se indica deadLetterRoutingKey', async () => {
		const respuesta = await fetch(`${base}/queues`, json('POST', { name: 'q', deadLetterRoutingKey: 'x' }));
		assert.equal(respuesta.status, 400);
	});

	await contexto.test('valida el tipo de exchange', async () => {
		assert.equal((await fetch(`${base}/exchanges`, json('POST', { name: 'hotel.x', type: 'raro' }))).status, 400);
		assert.equal((await fetch(`${base}/exchanges`, json('POST', { name: 'hotel.x', type: 'topic' }))).status, 201);
	});

	await contexto.test('traduce errores del servicio a códigos HTTP', async () => {
		assert.equal((await fetch(`${base}/queues/hotel.reportes.pdf.queue`, { method: 'DELETE' })).status, 409);
		assert.equal((await fetch(`${base}/queues/no-existe`, { method: 'DELETE' })).status, 404);
		assert.equal((await fetch(`${base}/queues/otra?ifEmpty=quizas`, { method: 'DELETE' })).status, 400);
		assert.equal((await fetch(`${base}/queues/otra?ifEmpty=true`, { method: 'DELETE' })).status, 200);
	});

	await contexto.test('elimina bindings con parámetros de query validados', async () => {
		const ok = await fetch(`${base}/bindings?source=hotel.x&destination=hotel.pruebas.queue&routingKey=a.b`, { method: 'DELETE' });
		assert.equal(ok.status, 204);
		assert.equal(servicio.bindingsEliminados[0]?.destinationType, 'queue');
		assert.equal((await fetch(`${base}/bindings?destination=q`, { method: 'DELETE' })).status, 400);
	});
});
