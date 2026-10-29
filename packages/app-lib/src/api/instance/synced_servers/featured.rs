use super::SERVERS_FILE;
use super::codec::{
    read_servers, server_data, server_identity_address, write_servers,
};
use quartz_nbt::NbtCompound;
use std::path::Path;

const FEATURED_SERVERS: [(&str, &str); 3] = [
    ("mc.sakeva.ru", "Здесь тебе всегда рады! (RU)"),
    ("mc.sakeva.net", "Здесь тебе всегда рады! (EU)"),
    ("mc.sakeva.fun", "Здесь тебе всегда рады! (Резерв)"),
];

fn normalized_address(server: &NbtCompound) -> String {
    let address = server_identity_address(server);
    address
        .strip_suffix(":25565")
        .map(str::to_owned)
        .unwrap_or(address)
}

/// Puts the Sakeva servers at the top of the instance's server list, keeping the
/// icon and settings of entries the player already has.
pub(crate) async fn ensure_featured_servers(
    instance_path: &Path,
) -> crate::Result<()> {
    let path = instance_path.join(SERVERS_FILE);
    let original = read_servers(&path).await?;
    let mut servers = original.clone();

    let mut featured = Vec::with_capacity(FEATURED_SERVERS.len());
    for (address, name) in FEATURED_SERVERS {
        let mut server = servers
            .iter()
            .position(|server| normalized_address(server) == address)
            .map(|index| servers.remove(index))
            .unwrap_or_else(|| server_data(name.into(), address.into(), None));
        server.insert("name", name);
        server.insert("ip", address);
        server.insert("hidden", 0_i8);
        featured.push(server);
    }
    servers.retain(|server| {
        !FEATURED_SERVERS
            .iter()
            .any(|(address, _)| normalized_address(server) == *address)
    });

    featured.append(&mut servers);
    if featured != original {
        write_servers(&path, &featured).await?;
    }
    Ok(())
}
