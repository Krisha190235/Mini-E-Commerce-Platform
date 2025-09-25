const express = require('express');
const cors = require('cors');
const app = express();

app.use(express.json());

// ✅ allow your frontend to call the API from the browser
app.use(cors({
  origin: ['http://localhost:8081', 'http://host.docker.internal:8081'],
}));

// --- Swagger ---
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'E-commerce API', version: '1.0.0' },
    servers: [{ url: 'http://localhost:8082' }],
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } }
  },
  apis: ['./**/*.js'], // you can narrow this if you want
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// existing routes...
app.get('/health', (req, res) => res.json({ status: 'ok' }));

module.exports = app;