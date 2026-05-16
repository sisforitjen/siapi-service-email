var express = require('express');
var router = express.Router();

router.get('/', function (req, res) {
  res.json({ service: 'service-email', status: 'running', version: '1.0.0' });
});

module.exports = router;
