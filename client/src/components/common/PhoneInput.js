import React from 'react';

const PhoneInput = ({ name, value, onChange, placeholder, required = false, className = "" }) => {
  const handlePhoneInputChange = (e) => {
    const { name, value } = e.target;
    let cleanValue = value.replace(/\D/g, ''); // Remove all non-digits
    
    // Limit to 10 digits
    if (cleanValue.length > 10) {
      cleanValue = cleanValue.slice(0, 10);
    }
    
    // Store as +1 + 10 digits for backend
    const formattedValue = cleanValue.length > 0 ? `+1${cleanValue}` : '';
    
    onChange({ target: { name, value: formattedValue } });
  };

  // Display phone number without +1 prefix for user input
  const getDisplayPhone = (phoneValue) => {
    if (!phoneValue) return '';
    if (phoneValue.startsWith('+1')) {
      return phoneValue.slice(2); // Remove +1 prefix for display
    }
    return phoneValue.replace(/\D/g, ''); // Remove non-digits if any
  };

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <span className="text-gray-500 sm:text-sm">+1</span>
      </div>
      <input
        type="tel"
        name={name}
        className={`w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200 bg-gray-50 focus:bg-white ${className}`}
        value={getDisplayPhone(value)}
        onChange={handlePhoneInputChange}
        placeholder={placeholder}
        maxLength="10"
        required={required}
      />
    </div>
  );
};

export default PhoneInput;
