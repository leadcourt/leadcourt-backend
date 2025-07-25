const express = require('express');
const router = express.Router();
const { authenticateJWT } = require('../middleware/auth');
const collaboratorController = require('../controllers/collaboratorController');

/**
 * @swagger
 * tags:
 *   name: Collaborators
 *   description: Manage user collaboration and account sharing
 */

// Apply authentication to all routes below this line
router.use(authenticateJWT);

/**
 * @swagger
 * /api/teams/invite:
 *   post:
 *     summary: Send a collaboration invite to another user
 *     tags: [Collaborators]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: someone@example.com
 *               permission:
 *                 type: string
 *                 enum: [view, edit, full]
 *                 default: view
 *     responses:
 *       200:
 *         description: Invite sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid input or already invited
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post('/invite', collaboratorController.sendInvite);

/**
 * @swagger
 * /api/teams/invitations:
 *   get:
 *     summary: View all pending collaboration invites sent to the current user
 *     tags: [Collaborators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending invites
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 invites:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       owner:
 *                         type: object
 *                         properties:
 *                           email:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                       permission:
 *                         type: string
 *                       status:
 *                         type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/invitations', collaboratorController.getIncomingInvites);

/**
 * @swagger
 * /api/teams/invitations/respond:
 *   post:
 *     summary: Accept or decline a collaboration invite
 *     tags: [Collaborators]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - ownerId
 *               - action
 *             properties:
 *               ownerId:
 *                 type: string
 *                 description: ID of the user who sent the invite
 *                 example: "64ef1a99e2b7e8d001c12b99"
 *               action:
 *                 type: string
 *                 enum: [accepted, declined]
 *     responses:
 *       200:
 *         description: Invite response recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Invite not found
 *       500:
 *         description: Internal server error
 */
router.post('/invitations/respond', collaboratorController.respondToInvite);

/**
 * @swagger
 * /api/teams/sentInvites:
 *   get:
 *     summary: List all collaborators for the current user
 *     tags: [Collaborators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of collaborators associated with the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collaborators:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         description: Collaboration ID
 *                       owner:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                       collaborator:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           displayName:
 *                             type: string
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/sentInvites', collaboratorController.getCollaborators);


/**
 * @swagger
 * /api/teams/acceptedInvitations:
 *   get:
 *     summary: List all collaborators for the current user
 *     tags: [Collaborators]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of collaborators associated with the user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 collaborators:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         description: Collaboration ID
 *                       owner:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                       collaborator:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           email:
 *                             type: string
 *                           displayName:
 *                             type: string
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/acceptedInvitations', collaboratorController.getAcceptedInvites);

module.exports = router;
