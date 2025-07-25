const express = require('express');
const router = express.Router();
const { getListSummary, storeList, showList, createEmptyList, queueExportJob, renameList, deleteList } = require('../controllers/listController');
const { collabAuthenticateJWT } = require('../middleware/collabAuth');

/**
 * @swagger
 * tags:
 *   name: List
 *   description: APIs for storing, showing, and summarizing saved user lists
 */

/**
 * @swagger
 * /api/list/summary:
 *   post:
 *     summary: Get all saved list names for a user
 *     description: |
 *       Returns an array of all saved list names for the given user.
 *       - If the user has no saved lists, returns an empty array.
 *     tags: [List]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: user123
 *     responses:
 *       200:
 *         description: Array of list names
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *               example:
 *                 - "Top Leads"
 *                 - "VC Leads"
 *       400:
 *         description: userId not provided
 *       500:
 *         description: Internal error while retrieving list names
 */
router.post('/summary', collabAuthenticateJWT, getListSummary);

/**
 * @swagger
 * /api/list/store:
 *   post:
 *     summary: Add new row_ids to a user's list (duplicates ignored)
 *     description: |
 *       Adds row_ids to a user-defined list. If the list does not exist, it is created.
 *       - Duplicate row_ids (already in the list) are ignored.
 *     tags: [List]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, listName, rowIds]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: user123
 *               listName:
 *                 type: string
 *                 example: Top Leads
 *               rowIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 example: [101, 102, 103, 104]
 *     responses:
 *       200:
 *         description: Success message with count of inserted rows
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 inserted:
 *                   type: integer
 *               example:
 *                 message: "List updated"
 *                 inserted: 4
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Failed to insert rows
 */
router.post('/store', collabAuthenticateJWT, storeList);

/**
 * @swagger
 * /api/list/show:
 *   post:
 *     summary: Show paginated rows from a specific user list (50 per page)
 *     description: |
 *       Fetches 50 rows from a saved list for a user.
 *       - Returns lead data with conditional masking of email/phone based on access.
 *       - Use `page` to paginate through saved results.
 *     tags: [List]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, listName]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: user123
 *               listName:
 *                 type: string
 *                 example: Top Leads
 *               page:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: List of leads with access-filtered email and phone
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   row_id:
 *                     type: integer
 *                   Name:
 *                     type: string
 *                   Designation:
 *                     type: string
 *                   Email:
 *                     type: string
 *                   Phone:
 *                     type: string
 *                   Organization:
 *                     type: string
 *                   City:
 *                     type: string
 *                   State:
 *                     type: string
 *                   Country:
 *                     type: string
 *               example:
 *                 - row_id: 101
 *                   Name: "Anthony Kuo"
 *                   Designation: "Director Of Product Management"
 *                   Email: null
 *                   Phone: null
 *                   Organization: "newegg"
 *                   City: "Los Angeles"
 *                   State: "California"
 *                   Country: "United States"
 *       400:
 *         description: Missing required fields
 *       500:
 *         description: Failed to fetch list items
 */
router.post('/show', collabAuthenticateJWT, showList);

/**
 * @swagger
 * /api/list/create:
 *   post:
 *     summary: Create a new empty list for a user
 *     description: |
 *       Creates a new list for a user by inserting a dummy row with row_id = -1.
 *       This helps track empty lists in summary while `showList` ignores such rows.
 *     tags: [List]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, listName]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: user123
 *               listName:
 *                 type: string
 *                 example: Top Leads
 *     responses:
 *       200:
 *         description: Confirmation message
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *               example:
 *                 message: "Empty list 'Top Leads' created successfully"
 *       400:
 *         description: Missing required fields or list already exists
 *       500:
 *         description: Failed to create list
 */
router.post('/create', collabAuthenticateJWT, createEmptyList);

/**
 * @swagger
 * /api/list/export:
 *   post:
 *     summary: Export list contents to CSV and send via email
 *     tags: [List]
 *     description: |
 *       Exports all rows from a specific user-defined list into a CSV and emails it to the specified address.
 *       All exported rows are marked as fully accessed (`accessType = 4`).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, listName, email]
 *             properties:
 *               userId:
 *                 type: string
 *                 example: test1234
 *               listName:
 *                 type: string
 *                 example: "VC Leads"
 *               email:
 *                 type: string
 *                 example: user@example.com
 *     responses:
 *       200:
 *         description: Confirmation that email was sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: CSV sent to email
 *       400:
 *         description: Missing required fields
 *       404:
 *         description: List not found or empty
 *       500:
 *         description: Failed to generate or send CSV
 */
router.post('/export', collabAuthenticateJWT, queueExportJob);

router.post('/rename', collabAuthenticateJWT, renameList);

router.delete('/:listName', collabAuthenticateJWT, deleteList);

module.exports = router;
