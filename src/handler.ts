import { APIGatewayProxyResult } from 'aws-lambda';
import { StatusCodes } from 'http-status-codes';
import { indexToBase62, base62ToIndex } from './converter';
import { QueryEvent, ParamEvent, Response, Error } from './@types/event';
import { Pool } from 'pg';

// Database
const connectDatabase = async function () {
  try {
    const db = new Pool({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: Number(process.env.DB_PORT),
    });

    await db.connect();
    return db;
  } catch (error) {
    console.error(error);
  }
};

// APIs
const shortUrlConverter = async (
  event: QueryEvent
): Promise<APIGatewayProxyResult | Error> => {
  try {
    const { url } = event.queryStringParameters;
    const db = await connectDatabase();
    if (!db) {
      throw new Error('DB Failed');
    }

    const insertQuery = `
    INSERT INTO url (origin_url)
    VALUES ($1)
    ON CONFLICT (origin_url)
    DO UPDATE
    SET
      updated_at = NOW()
    RETURNING id;`;

    const result = await db.query(insertQuery, [url]);
    const id = result.rows[0].id;
    const shortUrlToBase62 = indexToBase62(id);

    return {
      statusCode: StatusCodes.CREATED,
      headers: {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,POST,GET',
      },
      body: JSON.stringify({
        message: '🔁 Convert Success!',
        data: shortUrlToBase62,
      }),
    };
  } catch (error) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      error,
    };
  }
};

const redirectionToOrigin = async (
  event: ParamEvent
): Promise<Response | Error> => {
  try {
    const db = await connectDatabase();
    if (!db) {
      throw Error('DB Failed');
    }

    const { shortUrl } = event.pathParameters;
    const id = base62ToIndex(shortUrl);

    const query = `
      SELECT origin_url
      FROM url
      WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    if (!result) throw new Error('DB Not Found');

    const originUrl = result.rows[0].origin_url;

    return {
      statusCode: StatusCodes.MOVED_PERMANENTLY,
      headers: {
        Location: originUrl,
      },
    };
  } catch (error) {
    return {
      statusCode: StatusCodes.BAD_REQUEST,
      error,
    };
  }
};

export { shortUrlConverter, redirectionToOrigin };
