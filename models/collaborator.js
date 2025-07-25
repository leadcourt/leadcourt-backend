const mongoose = require('mongoose');
const { Schema } = mongoose;

const collaboratorSchema = new Schema({
  owner: { 
    // type: Schema.Types.ObjectId, 
    type: String,
    ref: 'User', required: true 
    },     // User A (account owner)
  ownerName: {
    type: String,
  },
  collaborator: { 
    // type: Schema.Types.ObjectId, 
    type: String,
    ref: 'User', required: true 
    }, // User B (collaborator)
  collaboratorName: {
    type: String,
  },
  collaboratorEmail: {
    type: String,
  },
  permission: { 
    type: String, 
    enum: ['viewer', 'editor', 'admin'], 
    default: 'viewer' 
    },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'declined'], 
    default: 'pending' 
    },
  invitedAt: { 
    type: Date, 
    default: Date.now 
    },
  acceptedAt: { 
    type: Date 
    },
});

collaboratorSchema.index({ owner: 1, collaborator: 1 }, { unique: true }); // prevent duplicates

module.exports = mongoose.model('Collaborator', collaboratorSchema);
