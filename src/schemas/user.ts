import { UserRole } from '@/generated/prisma';
import { t } from 'elysia';

export const UserIdSchema = t.String();
export const UserPasswordSchema = t.String();
export const UserRoleSchema = t.Enum(UserRole);

// Base user registration schema
export const BaseUserRegistrationSchema = t.Object({
	username: t.String({ minLength: 3, maxLength: 50 }),
	password: UserPasswordSchema,
	role: UserRoleSchema,
	auditorUsername: t.String({ minLength: 1 }),
	did: t.String({ minLength: 1 }),
});

// Plant user registration schema
export const PlantUserRegistrationSchema = t.Intersect([
	BaseUserRegistrationSchema,
	t.Object({
		role: t.Literal(UserRole.Plant),
		companyName: t.String({ minLength: 1 }),
		governmentLicenseId: t.String({ minLength: 1 }),
	}),
]);

// Industry user registration schema
export const IndustryUserRegistrationSchema = t.Intersect([
	BaseUserRegistrationSchema,
	t.Object({
		role: t.Literal(UserRole.Industry),
		companyName: t.String({ minLength: 1 }),
		governmentLicenseId: t.String({ minLength: 1 }),
	}),
]);

// Union schema for registration (removed Auditor - manual creation only)
export const UserRegistrationSchema = t.Union([
	PlantUserRegistrationSchema,
	IndustryUserRegistrationSchema,
]);

// Login schema
export const UserLoginSchema = t.Object({
	password: t.String(),
	did: t.Optional(t.String({ minLength: 1 })),
});
