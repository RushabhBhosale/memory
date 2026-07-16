import { Redirect } from "expo-router";

export default function CreateTab() {
  return <Redirect href={"/capture" as never} />;
}
