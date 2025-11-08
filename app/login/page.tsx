import { login, signup } from "./actions";

export default function LoginPage() {
  return (
    <form className="bg-white text-black flex flex-col">
      <label htmlFor="email">Email:</label>
      <input id="email" name="email" type="email" required />
      <label htmlFor="password">Password:</label>
      <input id="password" name="password" type="password" required />
      <label htmlFor="firstName">First Name:</label>
      <input id="firstName" name="first_name" type="text" required />
      <label htmlFor="lastName">Last Name:</label>
      <input id="lastName" name="last_name" type="text" required />
      <label htmlFor="phoneNumber">Phone:</label>
      <input id="phoneNumber" name="phone_number" type="tel" required />
      <label htmlFor="addressLine1">Address Line 1:</label>
      <input id="addressLine1" name="address_line1" type="text" required />
      <label htmlFor="AddressLine2">Address Line 2:</label>
      <input id="AddressLine2" name="address_line2" type="text" />
      <label htmlFor="city">City:</label>
      <input id="city" name="city" type="text" required />
      <label htmlFor="state">State:</label>
      <input id="state" name="state" type="text" required />
      <label htmlFor="zipcode">Zipcode:</label>
      <input id="zipcode" name="zipcode" type="text" required />
      <button formAction={login} className="border border-black">
        Log in
      </button>
      <button formAction={signup}>Sign up</button>
    </form>
  );
}
