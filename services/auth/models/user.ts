export interface User {
  userId: string;
  email: string;
  name: string;
  userType: string;
  createdAt: string;
  updatedAt: string;
}
  
export interface UserRegistrationData {
  email: string;
  password: string;
  name: string;
  userType: string;
}
  
export interface UserLoginData {
  email: string;
  password: string;
}