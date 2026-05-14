const router = require('express').Router();
const ctrl = require('../controllers/contentController');

router.get('/movies', ctrl.getHomeSections);      // /api/movies
router.get('/movies/:id', ctrl.getMovieDetail);    // /api/movies/:id
router.get('/tv/:id', ctrl.getTVDetail);           // /api/tv/:id
router.get('/search', ctrl.search);                // /api/search

module.exports = router;