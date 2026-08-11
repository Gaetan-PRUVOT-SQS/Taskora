// Avatars ronds avec initiales des membres
export function MemberAvatars(props) {
  const members = props.members || [];
  const max = props.max || 5;
  const shown = [];
  for (let i = 0; i < members.length && i < max; i++) {
    shown.push(members[i]);
  }
  const extra = members.length - shown.length;

  function initials(name) {
    if (!name) {
      return "?";
    }
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
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
            style={{ backgroundColor: colors[index % colors.length] }}
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
