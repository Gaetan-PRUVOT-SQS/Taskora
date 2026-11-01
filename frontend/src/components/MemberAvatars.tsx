import type { Member } from "../types.ts";

interface MemberAvatarsProps {
  members?: Member[];
  max?: number;
}

// Avatars ronds avec initiales des membres
export function MemberAvatars(props: MemberAvatarsProps) {
  const members = props.members || [];
  const max = props.max || 5;
  const shown = [];
  for (let i = 0; i < members.length && i < max; i++) {
    const member = members[i];
    if (member) {
      shown.push(member);
    }
  }
  const extra = members.length - shown.length;

  function initials(name: string) {
    if (!name) {
      return "?";
    }
    const parts = name.trim().split(" ");
    const first = parts[0];
    const second = parts[1];
    if (first && second && first[0] && second[0]) {
      return (first[0] + second[0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  // couleurs simples par index (pas de fluo partout)
  const colors = ["#000000", "#3a3a3c", "#1c1c1e", "#48484a", "#636366"];

  return (
    <div className="member-avatars" title={members.length + " membre(s)"}>
      {shown.map(function (member, index) {
        return (
          <span
            key={member.id}
            className="member-avatar"
            style={{ backgroundColor: colors[index % colors.length] ?? "#000000" }}
            title={member.name + " (" + member.role + ")"}
          >
            {initials(member.name)}
          </span>
        );
      })}
      {extra > 0 ? (
        <span className="member-avatar member-avatar-extra">+{extra}</span>
      ) : null}
    </div>
  );
}
