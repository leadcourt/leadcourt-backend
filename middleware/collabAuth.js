const { auth } = require("../config/firebase");
const mongoose = require('mongoose');
const Collaborator = require('../models/collaborator');

const collabAuthenticateJWT = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const collaborationId = req?.headers?.['x-collab-id']

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided or invalid format.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decodedToken = await auth.verifyIdToken(token);

    
    if (collaborationId) {
        if (!mongoose.Types.ObjectId.isValid(collaborationId)) {
          return res.status(400).json({ message: 'Invalid collaboration ID' });
        } 

        
        const collab = await Collaborator.findById({ _id: collaborationId })
    
        if (!collab) {
            return res.status(404).json({ message: 'Collaboration not found.' });
        }
    
        
        // Ensure the request user is the collaborator
        if (String(collab.collaborator) !== String(decodedToken.uid)) {
            return res.status(403).json({ message: 'You are not authorized for this collaboration.' });
        }

        // Check if the invite was accepted
        if (collab.status !== 'accepted') {
            return res.status(403).json({ message: 'This collaboration is not active.' });
        }


        const collabTeam = await admin.auth().getUser(collab.collaborator);
        
        
        req.user = {
            uid: collabTeam.uid,
            email: collabTeam.email || null,
            emailVerified: collabTeam.email_verified || false,
            name: collabTeam.name || null,
            picture: collabTeam.picture || null,
            role: collabTeam.role || "user",
        }

    } else {
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email || null,
          emailVerified: decodedToken.email_verified || false,
          name: decodedToken.name || null,
          picture: decodedToken.picture || null,
          role: decodedToken.role || "user",
        };

    }


    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid token. Authentication failed.",
    });
  }
};

module.exports = {
  collabAuthenticateJWT,
};