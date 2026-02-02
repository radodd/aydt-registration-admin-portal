export interface User {
  id: string;
  family_id: string;
  email: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  phone_number: string;
  is_primary_parent: boolean;
  role: string;
  status: string;
  created_at: string;
}

export interface Dancer {
  id: string;

  first_name: string;
  middle_name?: string | null;
  last_name: string;
  gender: string | null;
  birth_date: string | null;
  grade: string | null;
  email: string | null;
  phone_number: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  is_self: boolean;
  created_at: string;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
  }[];
  registrations?: {
    id: string;
    status: string;
    total_amount: number;
    created_at: string;
    programs: {
      id: string;
      title: string;
      description: string | null;
      type: string | null;
      location: string | null;
      // price: number | null;
      start_date: string | null;
      end_date: string | null;
    };
  }[];
}

export interface Family {
  id: string;
  family_name: string | null;
  created_at: string;
  users: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone_number: string | null;
    is_primary_parent: boolean;
  }[];
  dancers: {
    id: string;
    first_name: string;
    last_name: string;
    registrations: {
      id: string;
      programs: {
        id: string;
        title: string;
        days_of_week: string | null;
        start_time: string | null;
        end_time: string | null;
      } | null;
    }[];
  }[];
}

export interface Program {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  type?: string | null;
  location?: string | null;
  price: number | null;
  registration_fee?: number | null;
  discount?: string[] | null;
  start_date: string | null;
  end_date: string | null;
  days_of_week: string[] | null;
  start_time: string | null;
  end_time: string | null;
  capacity?: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ProgramAvailableDay {
  id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  // created_at: string;
}

export interface Registration {
  id: string;
  dancer_id: string;
  user_id: string;
  program_id: string;
  status: string | "pending";
  total_amount: number;
  created_at: string;
}
