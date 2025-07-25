module.exports = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const allowed = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];
  
    if (allowed.includes(ip)) return next();
  
    console.warn(`Blocked IP: ${ip}`);
    return res.status(403).json({ error: 'Forbidden' });
  };
  