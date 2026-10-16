import { useState } from "react";
import StudentReviewDialog from "./StudentReviewDialog";

export default function SubmittedImageGallery({ pages }) {
  const [selected, setSelected] = useState(null);
  const page = selected === null ? null : pages[selected];
  return <>
    <div className="student-file-grid">{pages.map((item, index) => <figure key={item.page_number || index}>
      <figcaption><strong>Page {item.page_number || index + 1}</strong><span>{item.name}</span></figcaption>
      <button type="button" className="student-image-trigger" aria-label={`Preview page ${item.page_number || index + 1}`} onClick={() => setSelected(index)}>
        <img src={item.url} alt={`Your submitted work, page ${item.page_number || index + 1}`} />
      </button>
      <a href={item.url} download={item.name}>Download page {item.page_number || index + 1}</a>
    </figure>)}</div>
    {page && <StudentReviewDialog title={`Page ${page.page_number || selected + 1} of ${pages.length}`} onClose={() => setSelected(null)}>
      <div className="student-image-lightbox"><p>{page.name}</p><img src={page.url} alt={`Your submitted work, page ${page.page_number || selected + 1}`} />
        {pages.length > 1 && <nav aria-label="Submission pages"><button type="button" disabled={selected === 0} onClick={() => setSelected(selected - 1)}>Previous page</button>
          <button type="button" disabled={selected === pages.length - 1} onClick={() => setSelected(selected + 1)}>Next page</button></nav>}
      </div>
    </StudentReviewDialog>}
  </>;
}
