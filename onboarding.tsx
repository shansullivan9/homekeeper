import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../utils/supabaseClient";

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState({type:"",year:"",heating:"",yard:""});
  const router = useRouter();
  
  function next(answer) {
    setAnswers(prev => ({...prev, ...answer}));
    setStep(step+1);
  }

  async function finish() {
    // Example starter appliances logic.
    const appliances = [
      { name: "HVAC", installed: answers.year },
      { name: answers.heating === "gas" ? "Gas Furnace" : "Electric Heater" },
      { name: "Refrigerator" }
    ];
    // Add to database
    for (let a of appliances) await supabase.from('appliances').insert(a);
    router.push('/dashboard');
  }

  if (step === 1) return <>
    <h1>Welcome! Is your home a...</h1>
    <button onClick={()=>next({type:"house"})}>House</button>
    <button onClick={()=>next({type:"condo"})}>Condo</button>
  </>;
  if (step === 2) return <>
    <h1>What year was it built?</h1>
    <input placeholder="Year" onBlur={e=>next({year:e.target.value})} />
  </>;
  if (step === 3) return <>
    <h1>How is your home heated?</h1>
    <button onClick={()=>next({heating:"gas"})}>Gas</button>
    <button onClick={()=>next({heating:"electric"})}>Electric</button>
    <button onClick={()=>next({heating:"heat pump"})}>Heat Pump</button>
    <button onClick={()=>next({heating:"idk"})}>I Don’t Know</button>
  </>;
  if (step === 4) return <>
    <h1>Do you have a yard?</h1>
    <button onClick={()=>{finish();}}>Yes</button>
    <button onClick={()=>{finish();}}>No</button>
  </>;
  return <h1>All done!</h1>
}
