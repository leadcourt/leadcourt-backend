module.exports = function buildEmailPhoneQuery(row_id, type) {
  let selectClause = '';

  if (type === 'email') {
    selectClause = 'Email';
  } else if (type === 'phone') {
    selectClause = 'Phone';
  } else if (type === 'both') {
    selectClause = 'Email, Phone';
  } else {
    throw new Error('Invalid type');
  }

  return `SELECT ${selectClause} FROM people WHERE row_id = ${row_id}`;
};