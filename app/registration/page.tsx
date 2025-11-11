"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { login } from "@/app/login/actions";
import { useRouter, useSearchParams } from "next/navigation";
import RegistrationForm from "../components/RegistrationForm";

export default function Registration() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const programId = searchParams.get("program");
  const [user, setUser] = useState<any>(null);
  const [authUser, setAuthUser] = useState<any>(null);
  const [program, setProgram] = useState<any>(null);
  const [registerSelf, setRegisterSelf] = useState(true);
  const [participantFirstName, setParticipantFirstName] = useState("");
  const [participantLastName, setParticipantLastName] = useState("");
  const [participantDob, setParticipantDob] = useState("");
  // useEffect(() => {
  //   if (registerSelf && user) {
  //     setParticipantFirstName(user.first_name);
  //     setParticipantLastName(user.last_name);
  //   } else {
  //     setParticipantFirstName(participantFirstName);
  //     setParticipantLastName("");
  //   }
  //   console.log(registerSelf);
  // }, [registerSelf, user, participantFirstName, participantLastName]);
  useEffect(() => {
    (async () => {
      // Step 1: Get logged-in authenticated user
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      setAuthUser(authUser);
      // Step 2: Fetch user data from users table via authUser ID
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();
      if (userError) {
        console.error(
          "Error fetching user logged in user data.",
          userError.message
        );
      } else {
        console.log("Logged in User", user);
        setUser(user);
      }
      // Step 3: Fetch selected program data via params
      if (programId) {
        const { data: prog, error } = await supabase
          .from("programs")
          .select("*")
          .eq("id", programId)
          .single();

        if (error) {
          console.error("Error fetch program data.", error.message);
        } else {
          setProgram(prog);
        }
      }
    })();
  }, [router, supabase, programId]);

  if (!user || !program) {
    return <p className="text-center mt-10 text-gray-600">Loading...</p>;
  }

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8 text-black">
      {/* Step 2: Participants & Options */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Participants & Options
        </h1>
        <button className="mb-6 text-blue-600 font-medium hover:underline">
          + Add sessions
        </button>

        <div className="border rounded-xl p-4 bg-gray-50">
          <h2 className="font-semibold text-lg mb-2">{program.title}</h2>
          <p className="text-gray-700 mb-2">
            <strong>
              {program.start_date} - {program.end_date}
            </strong>
          </p>
          <p className="text-sm text-gray-500">American Youth Dance Theater</p>
          <p className="text-sm mt-2">
            <strong>Subtotal:</strong> ${program.price}
          </p>

          {/* <p className="text-sm mt-2">9/22 – $40.00</p> */}
        </div>

        <div className="mt-6 border-t pt-4">
          <h3 className="font-semibold text-lg mb-2">Who is attending?</h3>
          <div className="mt-4">
            <p className="font-medium text-gray-800 mb-1">
              Who are you registering?
            </p>

            <div className="flex gap-4 text-sm text-gray-700">
              <label>
                <input
                  type="radio"
                  name="who"
                  checked={registerSelf}
                  onChange={() => {
                    setRegisterSelf(true);
                    setParticipantFirstName(user.first_name);
                    setParticipantLastName(user.last_name);
                  }}
                />
                Yourself
              </label>
              <label>
                <input
                  type="radio"
                  name="who"
                  checked={!registerSelf}
                  onChange={() => setRegisterSelf(false)}
                />{" "}
                A different adult
              </label>
            </div>
          </div>
          <div className="mb-2 text-gray-700">
            <strong>Participant:</strong>

            {!registerSelf ? (
              <label>
                <input
                  type="text"
                  name="First Name"
                  placeholder="First Name"
                  className="border border-black"
                  onChange={(e) => setParticipantFirstName(e.target.value)}
                />
                <input
                  type="text"
                  name="Last Name"
                  placeholder="Last Name"
                  className="border border-black"
                  onChange={(e) => setParticipantLastName(e.target.value)}
                />
              </label>
            ) : (
              <>
                {`${user.first_name}
             ${user.last_name}`}
              </>
            )}
          </div>

          <label className="block text-sm text-gray-600 mt-2">
            Date of Birth
          </label>
          <input
            type="date"
            defaultValue="1991-08-04"
            className="border rounded-lg px-3 py-2 w-full"
            onChange={(e) => setParticipantDob(e.target.value)}
          />

          <p className="text-xs text-gray-500 mt-1">
            Why do we ask this? To ensure proper class placement.
          </p>

          <button className="mt-6 bg-blue-600 text-white rounded-lg px-6 py-2 font-semibold hover:bg-blue-700">
            Continue
          </button>
        </div>
      </section>

      {/* Step 3: Registration Forms */}
      <RegistrationForm
        participantFirstName={participantFirstName}
        participantLastName={participantLastName}
        participantDob={participantDob}
        user={user}
        registerSelf={registerSelf}
        program={program}
      />
    </main>
  );
}
