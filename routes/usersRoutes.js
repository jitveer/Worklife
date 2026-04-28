const express = require('express');
const router = express.Router();
const user = require('../controllers/usersController');

router.get('/', user.getAllUsers);
router.get('/:id', user.getUserById);
router.put('/update/:id', user.updateUser);
router.delete('/delete/:id', user.deleteUser);
router.post('/send-passcode/:id', user.sendUserPasscode);

module.exports = router;
    