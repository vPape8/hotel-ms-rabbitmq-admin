import { RequestHandler, Router } from 'express';
import { RabbitAdminController } from '../controllers/rabbitAdminController';
import { RabbitAdmin } from '../services/rabbitAdminService';

export function crearRabbitRoutes(servicio: RabbitAdmin, autenticacion: RequestHandler): Router {
	const router = Router();
	const controlador = new RabbitAdminController(servicio);

	router.use(autenticacion);

	router.get('/queues', controlador.listarColas);
	router.post('/queues', controlador.crearCola);
	router.delete('/queues/:name', controlador.eliminarCola);

	router.get('/exchanges', controlador.listarExchanges);
	router.post('/exchanges', controlador.crearExchange);
	router.delete('/exchanges/:name', controlador.eliminarExchange);

	router.get('/bindings', controlador.listarBindings);
	router.post('/bindings', controlador.crearBinding);
	router.delete('/bindings', controlador.eliminarBinding);

	return router;
}
