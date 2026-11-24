export interface PasswordRequirements {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasSpecial: boolean;
}

export function evaluatePasswordRequirements(password: string): PasswordRequirements {
    return {
        minLength: password.length >= 8,
        hasUpper: /[A-Z]/.test(password),
        hasLower: /[a-z]/.test(password),
        hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    };
}

export function isStrongPassword(password: string): boolean {
    const req = evaluatePasswordRequirements(password);
    return req.minLength && req.hasUpper && req.hasLower && req.hasSpecial;
}

export const PASSWORD_POLICY_ERROR =
    'La contraseña debe tener mínimo 8 caracteres, al menos una mayúscula, una minúscula y un carácter especial.';
