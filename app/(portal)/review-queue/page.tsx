import { redirect } from "next/navigation";

// Review Queue consolidated into the Inbox. Keep the route as a redirect
// so existing links/bookmarks still resolve.
export default function ReviewQueueRedirect() {
  redirect("/inbox");
}
