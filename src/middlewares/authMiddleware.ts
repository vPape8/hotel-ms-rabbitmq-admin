import { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Valida el JWT de Microsoft Entra ID (mismo registro hotel-bff-admin que usan los otros microservicios)
 * y, si ENTRA_EXIGIR_ROL no es "false", exige el app role ENTRA_ROL_REQUERIDO (ADMIN por defecto).
 */
export function entraAuthMiddleware(solicitud: Request, respuesta: Response, siguiente: NextFunction): void {
	const tenantId = process.env.ENTRA_TENANT_ID;
	const audience = process.env.ENTRA_AUDIENCE;
	if (!tenantId || !audience) {
		respuesta.status(500).json({ error: 'AUTENTICACION_ENTRA_NO_CONFIGURADA' });
		return;
	}

	const token = solicitud.header('authorization')?.match(/^Bearer\s+(\S+)$/i)?.[1];
	if (!token) {
		respuesta.status(401).json({ error: 'TOKEN_REQUERIDO' });
		return;
	}

	jwks ??= createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
	jwtVerify(token, jwks, { issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`, audience })
		.then(({ payload }) => {
			const rolRequerido = process.env.ENTRA_ROL_REQUERIDO ?? 'ADMIN';
			const roles = Array.isArray(payload.roles) ? payload.roles : [];
			if (process.env.ENTRA_EXIGIR_ROL !== 'false' && !roles.includes(rolRequerido)) {
				respuesta.status(403).json({ error: 'ROL_INSUFICIENTE', requerido: rolRequerido });
				return;
			}
			solicitud.user = payload;
			siguiente();
		})
		.catch(() => {
			respuesta.status(401).json({ error: 'TOKEN_INVALIDO' });
		});
}
