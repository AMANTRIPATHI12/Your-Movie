const router = require('express').Router();
const { authenticateToken } = require('../middleware/auth');
const ctrl = require('../controllers/watchlistController');

router.get('/', authenticateToken, ctrl.getWatchlist);
router.post('/', authenticateToken, ctrl.addToWatchlist);
router.delete('/:movieId', authenticateToken, ctrl.removeFromWatchlist);

module.exports = router;