const nodemailer = require("nodemailer");
const { buildOtpEmailTemplate } = require("../templates/otpEmailTemplate");

let transporter;

const getTransporter = () => {
    if (transporter) return transporter;

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        const error = new Error("Email delivery is not configured on the server.");
        error.status = 503;
        throw error;
    }

    transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    return transporter;
};

const sendOtpEmail = async ({ to, fullname, otpCode }) => {
    const html = buildOtpEmailTemplate({ fullname, otpCode });

    await getTransporter().sendMail({
        from: `DigiEduSystem <${process.env.EMAIL_USER}>`,
        to,
        subject: "Your DigiEduSystem verification code",
        html,
        text: `Hello ${fullname || "learner"}, your DigiEduSystem verification code is ${otpCode}. It expires in 5 minutes.`
    });
};

module.exports = {
    sendOtpEmail
};
