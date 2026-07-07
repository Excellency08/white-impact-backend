function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone) {
  const re = /^[\d\s\-\+\(\)]{10,}$/;
  return re.test(phone);
}

function validateContactForm(data) {
  const errors = [];

  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push("Full name is required (minimum 2 characters)");
  }

  if (!data.email || !validateEmail(data.email)) {
    errors.push("Valid email address is required");
  }

  if (!data.subject || data.subject.trim().length < 5) {
    errors.push("Subject is required (minimum 5 characters)");
  }

  if (!data.message || data.message.trim().length < 10) {
    errors.push("Message is required (minimum 10 characters)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateNewsletterForm(data) {
  const errors = [];

  if (!data.email || !validateEmail(data.email)) {
    errors.push("Valid email address is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function validateDonationForm(data) {
  const errors = [];

  if (!data.fullName || data.fullName.trim().length < 2) {
    errors.push("Full name is required");
  }

  if (!data.email || !validateEmail(data.email)) {
    errors.push("Valid email address is required");
  }

  if (!data.phone || !validatePhone(data.phone)) {
    errors.push("Valid phone number is required");
  }

  if (!data.amount || isNaN(data.amount) || data.amount < 100) {
    errors.push("Donation amount must be at least ₦100");
  }

  if (!data.category || !["education", "digital-learning", "health-care", "civic-leadership", "others"].includes(data.category)) {
    errors.push("Valid program area is required");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validateEmail,
  validatePhone,
  validateContactForm,
  validateNewsletterForm,
  validateDonationForm,
};
