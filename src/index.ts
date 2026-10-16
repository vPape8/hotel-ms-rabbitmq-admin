import 'dotenv/config';
import { crearApp } from './app';
import { RabbitAdminService } from './services/rabbitAdminService';

const puerto = Number(process.env.PORT ?? 8083);
const servicio = new RabbitAdminService();

const servidor = crearApp(servicio).listen(puerto, () => {
	console.log(`hotel-ms-rabbitmq-admin escuchando en el puerto ${puerto}`);
});

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
	process.once(senal, () => {
		servidor.close();
		void servicio.cerrar().finally(() => process.exit(0));
	});
}
