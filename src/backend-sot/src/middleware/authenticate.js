// src/middleware/authenticate.js

import pool from "../config/db.js";
import jwt from "jsonwebtoken";

async function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Middleware: No se encontró token Bearer o formato inválido.');
        return res.status(401).json({ message: 'Unauthorized: Missing Authorization header or invalid format.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.decode(token);
        if (!decoded) {
            console.log('Middleware: Token inválido, no se pudo decodificar.');
            return res.status(401).json({ message: 'Unauthorized: Invalid token.' });
        }
    } catch (error) {
        console.error('Middleware: Error al decodificar token:', error.message);
        return res.status(401).json({ message: 'Unauthorized: Error decoding token.' });
    }

    const user_id       = decoded.user_id || decoded.sub;
    const email         = decoded.email;
    const full_name     = decoded.full_name;
    const organization_id = decoded.organization_id;
    const role          = (decoded.role || "user").toLowerCase();

    if (!user_id) {
        console.log('Middleware: user_id no encontrado en el token.');
        return res.status(401).json({ message: 'Unauthorized: User ID missing in token.' });
    }

    if (!organization_id) {
        console.log('Middleware: organization_id no encontrado en el token.');
        return res.status(400).json({ message: 'Bad Request: Organization ID missing in token.' });
    }

    let client;
    try {
        client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `INSERT INTO users (id, email, full_name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (id) DO NOTHING`,
                [user_id, email, full_name]
            );

            await client.query(
                `INSERT INTO memberships (user_id, organization_id, role)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, organization_id) DO NOTHING`,
                [user_id, organization_id, role]
            );

            await client.query('COMMIT');
        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error('Middleware: Error en transacción de identidad, rollback:', dbError.message);
            return res.status(500).json({ message: 'Internal Server Error: Database operation failed during identity bridge.' });
        } finally {
            if (client) client.release();
        }

        req.user = {
            id: user_id,
            organization_id,
            role
        };

        next();
    } catch (poolError) {
        console.error('Middleware: Error al conectar a la base de datos:', poolError.message);
        return res.status(500).json({ message: 'Internal Server Error: Could not connect to database.' });
    }
}

export default authenticate;