export const generateOtp = () => {
  const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit number
  return otp.toString();
};
