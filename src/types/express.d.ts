import 'express';

declare global {
	namespace Express {
		interface User {
			[key: string]: unknown;
		}

		interface Request {
			user?: User;
		}
	}
}

export {};