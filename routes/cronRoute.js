const express = require('express');
const router = express.Router();
const onlyLocal = require('../middleware/onlyLocal');
const cronController = require('../controllers/cronController');

router.post('/export', onlyLocal, cronController.runExportJobs);
router.post('/checkpoint', onlyLocal, cronController.runCheckpoint);

module.exports = router;