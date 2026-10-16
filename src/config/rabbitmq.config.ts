// Configuración centralizada de la conexión y de los recursos que la API no deja borrar.

function lista(variable: string | undefined, porDefecto: string[]): string[] {
	return variable ? variable.split(',').map((valor) => valor.trim()).filter(Boolean) : porDefecto;
}

export const rabbitAdminConfig = {
	/** Conexión AMQP para crear/eliminar recursos. */
	url: process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672',
	/** API HTTP del plugin de management (solo para listar). */
	managementUrl: (process.env.RABBITMQ_MANAGEMENT_URL ?? 'http://localhost:15672').replace(/\/$/, ''),
	usuario: process.env.RABBITMQ_USER ?? 'guest',
	clave: process.env.RABBITMQ_PASSWORD ?? 'guest',
	vhost: process.env.RABBITMQ_VHOST ?? '/',

	/**
	 * Topología de la que dependen hotel-ms-reservas y hotel-ms-notificaciones:
	 * la API responde 409 RECURSO_PROTEGIDO si se intenta eliminar.
	 */
	protegidos: {
		exchanges: lista(process.env.RABBITMQ_EXCHANGES_PROTEGIDOS, [
			'hotel.reservas.exchange',
			'hotel.documentos.exchange',
			'hotel.reintentos.exchange',
			'hotel.dlx'
		]),
		colas: lista(process.env.RABBITMQ_COLAS_PROTEGIDAS, [
			'hotel.reservas.confirmacion.queue',
			'hotel.reservas.confirmacion.queue.retry',
			'hotel.reservas.confirmacion.dlq',
			'hotel.reportes.queue',
			'hotel.reportes.queue.retry',
			'hotel.reportes.dlq',
			'hotel.notificaciones.queue',
			'hotel.notificaciones.queue.retry',
			'hotel.notificaciones.dlq',
			'hotel.no-entregados.dlq'
		])
	}
} as const;
