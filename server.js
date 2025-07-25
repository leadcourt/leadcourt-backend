require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const filterRoute = require('./routes/filterRoute');
const listRoute = require('./routes/listRoute');
const cronRoutes = require('./routes/cronRoute');
const creditsRoutes = require('./routes/credits');
const webhookRoutes = require('./routes/webhook');
const transactionRoutes = require('./routes/transactionRoute');
const hubspotRoutes = require('./routes/hubspot');
const locationRoutes = require('./routes/locationRoute');
const sabpaisaRoutes = require('./routes/sabpaisaRoutes');
const swaggerSpec = require('./config/swagger');
const swaggerUi = require('swagger-ui-express');
const connectDB = require('./config/mongo');

const app = express();
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', true);

app.use(cors({ origin: '*' }));

app.use('/paypal', express.raw({ type: 'application/json' }));
app.use(bodyParser.json());
app.use('/api/filter', filterRoute);
app.use('/api/cron', cronRoutes);
app.use('/api/list', listRoute);
app.use('/api/credits', creditsRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/paypal', webhookRoutes);
app.use('/api/sabpaisa', sabpaisaRoutes);
app.use('/api/integrations/hubspot', hubspotRoutes);
app.use('/api/location', locationRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
