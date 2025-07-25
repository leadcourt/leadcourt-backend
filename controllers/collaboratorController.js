const mongoose = require('mongoose');
const Collaborator = require('../models/collaborator');
// const User = require('../models/user.model');
const admin = require('firebase-admin');
/**
 * POST /invite
 * Send a collaboration invite
 */

exports.sendInvite = async (req, res) => {
  const { email, role_permission } = req.body;
  const owner = req.user;

  const permission = role_permission || 'viewer';


  
  console.log('In the collab invitation.js uid\n\n', owner);

  try {
    // const targetUser = await User.findOne({ email });

    const targetUser = await admin.auth().getUserByEmail(email);
    
    const ownerDetails = await admin.auth().getUser(owner.uid);
    const ownerUser = ownerDetails.toJSON();

    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }


    // console.log('Target User ID:', targetUser.uid);
    // console.log('Owner User ID:', owner.uid);
    if (targetUser.uid == ownerUser.uid) {
      return res.status(400).json({ message: 'You cannot invite yourself' });
    }

    // console.log('Checking existing collaborations for owner:', owner.uid, 'and collaborator:', targetUser.uid);
    const existing = await Collaborator.findOne({
      owner: ownerUser.uid,
      collaborator: targetUser.uid,
    });

    // console.log('Existing Collaboration:', existing);
    if (existing) {
      if (existing.status === 'accepted') {

        return res.status(200).json({ message: 'User is already a collaborator' });
      }
      // console.log('Existing Collaboration Status:', existing.status);
      if (existing.status === 'pending') {
        return res.status(200).json({ message: 'Invite already sent' });
      }

      // If previously declined or removed, re-send the invite
      existing.permission = permission;
      existing.status = 'pending';
      existing.invitedAt = new Date();
      await existing.save();

      return res.status(200).json({ message: 'Invite re-sent successfully' });
    }
    // console.log('No existing collaboration found, creating a new one');

    const ownerName = ownerUser.displayName || `${ownerUser.firstName} ${ownerUser.lastName}` || ownerUser.email;
    // console.log('Owner Name:', ownerName);
    
    const collaboratorName = targetUser.displayName || `${targetUser.firstName} ${targetUser.lastName}` || targetUser.email;
    // console.log('Collaborator Name:', collaboratorName);


    // console.log('Creating new collaboration invite');
    const newCollab = new Collaborator({
      owner: ownerUser.uid,
      ownerName,
      collaboratorName,
      collaboratorEmail: targetUser.email,
      collaborator: targetUser.uid,
      permission,
      status: 'pending',
      invitedAt: new Date(),
    });

    await newCollab.save();

    return res.status(201).json({ message: 'Invite sent successfully' });
  } catch (err) {
    if (err.errorInfo.message === 'There is no user record corresponding to the provided identifier.'){
      return res.status(400).json({ message: 'Invitation Failed, user not found' });

    }
    console.log('Send Invite Error:', err.errorInfo.message);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
/**
 * GET /invites
 * View invites received by current user
 */
exports.getIncomingInvites = async (req, res) => {
  const user = req.user; 

  try {
    const invites = await Collaborator.find({
      collaborator: user.uid,
      status: { $in: ['pending', 'declined'] },
    })

    return res.status(200).json({ invites });
  } catch (err) {
    console.error('Get Invites Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};



exports.getAcceptedInvites = async (req, res) => {
  const user = req.user;
  console.log('In the accepted Invites\n\n');

  try {
    const invites = await Collaborator.find({
      collaborator: user.uid,
      status: 'accepted',
    })

    return res.status(200).json({ invites });
  } catch (err) {
    console.error('Get Projects Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * POST /invite/respond
 * Accept or decline a collaboration invite
 */
exports.respondToInvite = async (req, res) => {
  const user = req.user;
  const { _id, action } = req.body;

  console.log('Rsponse payload', _id, action, user);

  if (!['accepted', 'declined'].includes(action)) {
    return res.status(400).json({ message: 'Invalid action' });
  }
  console.log('Rsponse received')
  try {
    if (!mongoose.Types.ObjectId.isValid(_id)) {
      console.log('Invalid invite ID:', _id);
      return res.status(404).json({ message: 'Invalid invite ID' });
    }

    console.log('id valid')

    const collab = await Collaborator.findOne({
      _id,
      collaborator: user.uid,
      status: 'pending',
    });

    console.log('Collab found:', collab);
    if (!collab) {
      return res.status(404).json({ message: 'Invite not found' });
    }
    
    // Ensure the user is the intended collaborator
    console.log('Collab collaborator:', collab.collaborator, 'User ID:', user.uid);
    if (collab.collaborator !== user.uid) {
      return res.status(400).json({ message: 'Unauthorized Action' });
    }

    // Update the collaboration status
    console.log('Updating collaboration status to:', action);
    collab.status = action;
    if (action === 'accepted') {
      collab.acceptedAt = new Date();
    }

    // Save the updated collaboration
    console.log('Saving updated collaboration:', collab);
    await collab.save();  

    console.log('Collaboration updated successfully');
    return res.status(200).json({ message: `Invite ${action}` });
  } catch (err) {
    console.error('Respond Invite Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};


/**
 * GET /collaborators
 * List all collaborators for the current user
 */       

exports.getCollaborators = async (req, res) => {
  const user = req.user;
  console.log('In the getCollaborators request user\n\n', user);
  try {
    const collaborators = await Collaborator.find({
      owner: user.uid
    })
    // .lean();

    console.log('Collaborators:', collaborators);
    return res.status(200).json({ collaborators });
  } catch (err) {
    console.error('Get Collaborators Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};