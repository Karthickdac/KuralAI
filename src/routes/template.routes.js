const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const {
  listQaTemplates, createQaTemplate, updateQaTemplate, deleteQaTemplate,
  listPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate,
} = require('../controllers/templateController');

router.use(authenticateToken);

router.get('/qa',          listQaTemplates);
router.post('/qa',         createQaTemplate);
router.put('/qa/:id',      updateQaTemplate);
router.delete('/qa/:id',   deleteQaTemplate);

router.get('/prompts',         listPromptTemplates);
router.post('/prompts',        createPromptTemplate);
router.put('/prompts/:id',     updatePromptTemplate);
router.delete('/prompts/:id',  deletePromptTemplate);

module.exports = router;
