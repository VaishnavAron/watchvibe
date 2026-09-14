// utils/validateUser.js
import validator from 'validator';

export default function validateUser(data) {
  const mandatoryFields = ["first_name", "age", "emailid", "password"];
  const isAllowed = mandatoryFields.every(k => Object.keys(data).includes(k));
  if (!isAllowed) throw new Error("fields are missing");
  if (!validator.isEmail(data.emailid)) throw new Error("invalid email");
}