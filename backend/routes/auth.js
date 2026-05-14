const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/signup', ctrl.signup);
router.post('/login', ctrl.login);
router.get('/user', authenticateToken, ctrl.getUser);

module.exports = router;