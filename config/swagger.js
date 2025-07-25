const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'B2B SaaS API Docs',
      version: '1.0.0',
      description: 'API documentation for the B2B SaaS project',
    },
    servers: [
      {
        url: 'http://155.133.23.176:5000',
        description: 'Server Hosted on Contabo',
      },
    ],
  },
  apis: ['./routes/*.js', './controllers/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;
