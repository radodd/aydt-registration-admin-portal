export interface User {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string;
  is_primary_parent: boolean;
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
}

// export interface DancerWithRelations extends Dancer {
//   users:
//     | {
//         id: string;
//         first_name: string;
//         last_name: string;
//         email: string;
//       }[]
//     | null;

//   families:
//     | {
//         id: string;
//         family_name: string;
//       }[]
//     | null;
// }

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
