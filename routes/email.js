var express = require('express');
var router = express.Router();
var serviceAuth = require('../middleware/serviceAuth');
var { validateSend, send, getLogs, getLogById } = require('../controllers/EmailController');

router.post('/send', serviceAuth, validateSend, send);
router.get('/logs', serviceAuth, getLogs);
router.get('/logs/:id', serviceAuth, getLogById);

module.exports = router;
