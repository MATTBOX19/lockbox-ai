import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../supabaseClient";

export default function AuthUI() {
  return (
    <div className="flex justify-center items-center min-h-screen bg-black text-white">
      <div className="bg-gray-900 p-6 rounded-2xl shadow-xl w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-center text-blue-400">
          LockBox AI Login
        </h1>
        <Auth
          supabaseClient={supabase}
          appearance={{ theme: ThemeSupa }}
          theme="dark"
          providers={[]}
        />
      </div>
    </div>
  );
}
