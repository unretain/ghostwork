// Onchain card art. Every card shows the same pixel ghost on one of six background
// colours. The image is an SVG built by the contract at mint and stored in the NFT's
// standard metadata (`media`), so it looks the same in any wallet or explorer.
use near_sdk::{env, near, require};

/// (name, centre colour, edge colour)
pub const PALETTE: [(&str, &str, &str); 6] = [
    ("Ember", "#e8634a", "#7d2616"),
    ("Sun", "#eeb04f", "#8a5a12"),
    ("Moss", "#5fae7a", "#1f5233"),
    ("Tide", "#4f97d8", "#173f6b"),
    ("Iris", "#9a76de", "#3d2578"),
    ("Bone", "#a39d93", "#45403a"),
];

// 14 x 14 sprite: X = body, E = eye, . = empty
const SPRITE: [&str; 14] = [
    "....XXXXXX....",
    "..XXXXXXXXXX..",
    ".XXXXXXXXXXXX.",
    ".XXXXXXXXXXXX.",
    "XXXEEXXXXEEXXX",
    "XXXEEXXXXEEXXX",
    "XXXEEXXXXEEXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XXXXXXXXXXXXXX",
    "XX.XXX..XXX.XX",
    "X...XX..XX...X",
];
const UNIT: usize = 6;
const ORIGIN: (usize, usize) = (38, 14);

#[near(serializers = [json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Traits {
    pub color: String,
}

/// The colour a card gets when the minter doesn't choose: picked by a hash of its token id.
pub fn traits_for(token_id: &str) -> Traits {
    let h = env::sha256_array(format!("ghostwork/art/{token_id}").as_bytes());
    Traits {
        color: PALETTE[(h[0] % PALETTE.len() as u8) as usize].0.to_string(),
    }
}

/// Traits for a colour the minter chose. Panics if it is not in the palette.
pub fn traits_from_color(color: String) -> Traits {
    require!(
        PALETTE.iter().any(|(name, _, _)| *name == color),
        "Colour must be one of the built-in options"
    );
    Traits { color }
}

pub fn svg_for(t: &Traits) -> String {
    let (_, light, dark) = PALETTE
        .iter()
        .find(|(name, _, _)| *name == t.color)
        .copied()
        .unwrap_or(PALETTE[5]);
    let mut s = String::with_capacity(2400);
    s.push_str("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120' shape-rendering='crispEdges'>");
    s.push_str(&format!(
        "<defs><radialGradient id='g' cx='50%' cy='42%' r='78%'><stop offset='0' stop-color='{light}'/><stop offset='1' stop-color='{dark}'/></radialGradient></defs>\
         <rect width='160' height='120' fill='url(#g)'/><rect x='50' y='101' width='60' height='5' fill='#000' opacity='.22'/>"
    ));
    // each run of equal cells in a row becomes one rect
    for (row, line) in SPRITE.iter().enumerate() {
        let cells = line.as_bytes();
        let mut col = 0;
        while col < cells.len() {
            let kind = cells[col];
            let start = col;
            while col < cells.len() && cells[col] == kind {
                col += 1;
            }
            if kind == b'.' {
                continue;
            }
            let fill = if kind == b'E' { "#1b1612" } else { "#f6f1ea" };
            s.push_str(&format!(
                "<rect x='{}' y='{}' width='{}' height='{}' fill='{fill}'/>",
                ORIGIN.0 + start * UNIT,
                ORIGIN.1 + row * UNIT,
                (col - start) * UNIT,
                UNIT
            ));
        }
    }
    s.push_str("</svg>");
    s
}

const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

fn base64(input: &[u8]) -> String {
    let mut out = String::with_capacity(input.len().div_ceil(3) * 4);
    for chunk in input.chunks(3) {
        let b = [chunk[0], *chunk.get(1).unwrap_or(&0), *chunk.get(2).unwrap_or(&0)];
        out.push(B64[(b[0] >> 2) as usize] as char);
        out.push(B64[(((b[0] & 3) << 4) | (b[1] >> 4)) as usize] as char);
        out.push(if chunk.len() > 1 { B64[(((b[1] & 15) << 2) | (b[2] >> 6)) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { B64[(b[2] & 63) as usize] as char } else { '=' });
    }
    out
}

/// The image as a data URI, ready for the NEP-177 `media` field.
pub fn media_for(t: &Traits) -> String {
    format!("data:image/svg+xml;base64,{}", base64(svg_for(t).as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64(b""), "");
        assert_eq!(base64(b"f"), "Zg==");
        assert_eq!(base64(b"fo"), "Zm8=");
        assert_eq!(base64(b"foo"), "Zm9v");
        assert_eq!(base64(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn sprite_is_square() {
        assert!(SPRITE.iter().all(|row| row.len() == 14));
    }

    #[test]
    fn default_colours_are_deterministic_and_cover_the_palette() {
        assert_eq!(traits_for("7"), traits_for("7"));
        let seen: std::collections::HashSet<String> =
            (0..60).map(|i| traits_for(&i.to_string()).color).collect();
        assert_eq!(seen.len(), PALETTE.len());
    }

    #[test]
    fn svg_is_well_formed_for_every_colour() {
        for (name, light, _) in PALETTE {
            let svg = svg_for(&Traits { color: name.to_string() });
            assert!(svg.starts_with("<svg") && svg.ends_with("</svg>"));
            assert!(svg.contains(light));
            assert!(!svg.contains('"'), "attributes use single quotes");
            assert!(svg.len() < 2600, "svg is {} bytes", svg.len());
            assert_eq!(svg.matches('<').count(), svg.matches('>').count());
        }
    }
}
