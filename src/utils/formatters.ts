export const formatPhone = (phoneNumber: string): string => {
    const cleaned = phoneNumber.replace(/\D/g, '');

    // Check if the number is a standard 10-digit US number
    if (cleaned.length === 10) {
        return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length === 7) {
        // Handle 7-digit local numbers
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3)}`;
    } else if (cleaned.length === 11 && cleaned[0] === '1') {
        // Handle US numbers with leading 1
        return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    // Return original number if it doesn't fit standard formats
    return phoneNumber;
}

// src/utils/formatters.ts

/**
 * Properly capitalizes a category name
 * - Capitalizes first letter of each word
 * - Preserves common acronyms like "HVAC"
 * - Handles null/undefined values
 */
export const formatCategory = (category?: string | null): string => {
    if (!category) return '';
    
    // List of words to keep uppercase (acronyms, etc.)
    const preserveUppercase = ['hvac', 'iicrc', 'epa', 'diy'];
    
    return category
      .split(' ')
      .map(word => {
        // Check if this word should remain uppercase
        const lowercaseWord = word.toLowerCase();
        if (preserveUppercase.includes(lowercaseWord)) {
          return lowercaseWord.toUpperCase();
        }
        
        // Otherwise capitalize first letter only
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  };