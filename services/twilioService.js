const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const sendOTP = async (phoneNumber) => {
  try {
    const verification = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });

    return { success: true, message: 'OTP Sent', verification };
  } catch (error) {
    console.error('Twilio OTP Error:', error);
    return { success: false, message: 'Failed to send OTP', error };
  }
};

const verifyOTP = async (phoneNumber, code) => {
  try {
    const verificationCheck = await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code });

    if (verificationCheck.status === 'approved') {
      return { success: true, message: 'OTP Verified', verificationCheck };
    } else {
      return { success: false, message: 'Invalid OTP' };
    }
  } catch (error) {
    console.error('Twilio OTP Verification Error:', error);
    return { success: false, message: 'OTP verification failed', error };
  }
};

module.exports = { sendOTP, verifyOTP };
